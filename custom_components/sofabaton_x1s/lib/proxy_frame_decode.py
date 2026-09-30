"""Frame ingest and decoded logging mixin for :class:`X1Proxy`."""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple, TYPE_CHECKING

from .frame_handlers import FrameContext, frame_handler_registry
from .commands import (
    parse_button_burst_frame,
    parse_command_burst_frame,
)
from .macros import parse_macro_burst_frame
from .hub_logging import LogTag
from .protocol_const import (
    FAMILY_PLAY_BLOB,
    OP_CATALOG_ROW_DEVICE,
    OP_REQ_ACTIVITIES,
    OP_REQ_DEVICES,
    OPNAMES,
    opcode_family,
    opcode_family_name,
)

if TYPE_CHECKING:
    from .proxy_host import _ProxyHost


def _hexdump(data: bytes) -> str:
    return data.hex(" ")


class FrameDecodeMixin(_ProxyHost if TYPE_CHECKING else object):
    """Mixin providing deframer feed hooks and structured frame logs."""

    def _handle_hub_frame(self, data: bytes, cid: int) -> None:
        if self.diag_dump:
            self._log.debug("%s #%d H→A %s", LogTag.WIRE, cid, _hexdump(data))
        frames = self._df_h2a.feed(data, cid)
        if frames:
            self._handle_hub_frames(frames)
            # Always: _log_frames also dispatches the opcode handlers (the
            # banner, acks, catalog rows ...). Gating it on diag_parse
            # switched the protocol off for a diag_parse=False engine
            # (latent since the first commit; found by a bench probe
            # 2026-09-12). diag_parse now gates only the decoded summaries.
            self._log_frames("H→A", frames)

    def _handle_app_frame(self, data: bytes, cid: int) -> None:
        if self.diag_dump:
            self._log.debug("%s #%d A→H %s", LogTag.WIRE, cid, _hexdump(data))
        frames = self._df_a2h.feed(data, cid)
        if frames:
            self._handle_app_frames(frames)
            self._log_frames("A→H", frames)  # dispatches handlers too; see above

    def _handle_app_frames(self, frames: List[Tuple[int, bytes, bytes, int, int]]) -> None:
        for opcode, _raw, _payload, _scid, _ecid in frames:
            if opcode == OP_REQ_DEVICES:
                self._begin_device_request()
                self._app_devices_deadline = self._time_monotonic() + 1.0
                self._app_devices_retry_sent = False
            elif opcode == OP_REQ_ACTIVITIES:
                # When the app drives the session the proxy never issues its
                # own REQ_ACTIVITIES, so without arming a pending snapshot here
                # every activity row the hub returns is rejected as a "ghost"
                # row (see ingest_activity_row). The app refreshes the activity
                # list after each state change (it does so in response to the
                # hub's ACK_READY push), so adopting that refresh is how the
                # running-activity state stays current while connected.
                self._begin_activity_request()

    def _handle_hub_frames(self, frames: List[Tuple[int, bytes, bytes, int, int]]) -> None:
        for opcode, _raw, payload, _scid, _ecid in frames:
            if opcode == OP_CATALOG_ROW_DEVICE:
                self._clear_app_device_retry()
            self._ingest_ir_learn_frame(opcode, payload)

    def _clear_app_device_retry(self) -> None:
        self._app_devices_deadline = None
        self._app_devices_retry_sent = False

    def parse_device_commands(self, payload: bytes, dev_id: int) -> Dict[int, str]:
        """Parse an assembled REQ_COMMANDS body using the fixed-width schema."""

        return self.state.parse_device_commands(
            payload, dev_id, hub_version=self.hub_version
        )

    def _time_monotonic(self) -> float:
        import time

        return time.monotonic()

    def _log_frames(self, direction: str, frames: List[Tuple[int, bytes, bytes, int, int]]) -> None:
        # This method has two responsibilities, only one of which is logging:
        #   1. dispatch each frame to its registered frame_handler_registry
        #      handler — that is the path that ingests activities/devices/
        #      buttons/commands/macros into the proxy state cache;
        #   2. emit DEBUG-level decoded summaries for the tools-card logs tab
        #      and the diagnostics download.
        # The DEBUG-only work is skipped when nothing is listening or when
        # diag_parse is off, but the handler dispatch must run regardless of
        # either — gating it would leave the catalog empty whenever hex
        # logging is off (and did, for diag_parse=False, until 2026-09-12).
        debug_enabled = self.diag_parse and self._log.isEnabledFor(logging.DEBUG)
        for op, raw, payload, scid, ecid in frames:
            name: str | None = None

            if debug_enabled:
                name = OPNAMES.get(op)
                fam_name = opcode_family_name(op)
                fam = opcode_family(op)
                note = f"chunk={scid}→{ecid}" if scid != ecid else f"chunk={ecid}"
                parsed = parse_command_burst_frame(
                    op,
                    raw,
                    hub_version=self.hub_version,
                )
                parsed_macro = parse_macro_burst_frame(op, raw)
                if name is None and parsed_macro is not None:
                    name = parsed_macro.display_name

                if name is not None:
                    label = (
                        f"{name} (0x{op:04X})"
                        if fam_name is None
                        else f"{name} (0x{op:04X}) family={fam_name}"
                    )
                elif fam_name is not None:
                    label = f"family={fam_name} op=0x{op:04X}"
                else:
                    label = f"unknown op=0x{op:04X}"
                self._log.debug(
                    "%s %s %s len=%d %s", LogTag.FRAME, direction, label, len(raw), note
                )
                if parsed is not None:
                    totals = (
                        f"{parsed.frame_no}/{parsed.total_frames}"
                        if parsed.total_frames is not None
                        else f"{parsed.frame_no}"
                    )
                    first_cmd = (
                        f" first_cmd=0x{parsed.first_command_id:02X}"
                        if parsed.first_command_id is not None
                        else ""
                    )
                    fmt = (
                        f" fmt=0x{parsed.format_marker:02X}"
                        if parsed.format_marker is not None
                        else ""
                    )
                    total_commands = (
                        f" total_cmds={parsed.total_commands}"
                        if parsed.total_commands is not None
                        else ""
                    )
                    self._log.debug(
                        f"{LogTag.FRAME} %s REQ_COMMANDS role=%s variant=%s page=%s dev=0x%02X%s%s%s",
                        note,
                        parsed.role,
                        parsed.layout_kind,
                        totals,
                        parsed.device_id,
                        total_commands,
                        first_cmd,
                        fmt,
                    )
                parsed_buttons = parse_button_burst_frame(op, raw, hub_version=self.hub_version)
                if parsed_buttons is not None:
                    totals = (
                        f"{parsed_buttons.frame_no}/{parsed_buttons.total_frames}"
                        if parsed_buttons.total_frames is not None
                        else f"{parsed_buttons.frame_no}"
                    )
                    total_rows = (
                        f" total_rows={parsed_buttons.total_rows}"
                        if parsed_buttons.total_rows is not None
                        else ""
                    )
                    activity = (
                        f" act=0x{parsed_buttons.activity_id:02X}"
                        if parsed_buttons.activity_id is not None
                        else ""
                    )
                    row_data = " row_data=yes" if parsed_buttons.has_row_data else " row_data=no"
                    self._log.debug(
                        f"{LogTag.FRAME} %s REQ_BUTTONS role=%s variant=%s page=%s%s%s%s",
                        note,
                        parsed_buttons.role,
                        parsed_buttons.layout_kind,
                        totals,
                        activity,
                        total_rows,
                        row_data,
                    )

                if parsed_macro is not None:
                    frag = (
                        f"{parsed_macro.fragment_index}/{parsed_macro.total_fragments}"
                        if parsed_macro.fragment_index is not None and parsed_macro.total_fragments is not None
                        else (f"{parsed_macro.fragment_index}" if parsed_macro.fragment_index is not None else "?")
                    )
                    activity = (
                        f" act=0x{parsed_macro.activity_id:02X}"
                        if parsed_macro.activity_id is not None
                        else ""
                    )
                    start_cmd = (
                        f" start_cmd=0x{parsed_macro.start_command_id:02X}"
                        if parsed_macro.start_command_id is not None
                        else ""
                    )
                    len_ok = " len_ok=yes" if parsed_macro.payload_length_matches_hi else " len_ok=no"
                    self._log.debug(
                        f"{LogTag.FRAME} %s REQ_MACROS role=%s frag=%s%s%s%s",
                        note,
                        parsed_macro.role,
                        frag,
                        activity,
                        start_cmd,
                        len_ok,
                    )

                if direction == "A→H" and fam == FAMILY_PLAY_BLOB:
                    blob = self._extract_single_frame_play_blob(payload)
                    if blob is not None:
                        descriptor_text = self._descriptive_play_blob_text(blob)
                        if descriptor_text is not None:
                            self._log.debug("%s descriptor %s", LogTag.IR, descriptor_text)

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
                except Exception as exc:
                    self._log_handler_failure(handler, op, direction, exc)

    def _log_handler_failure(self, handler: object, op: int, direction: str, exc: Exception) -> None:
        """A handler failure is isolated, but never silent: the first one per
        (handler, exception type) is a WARNING with the traceback, repeats
        drop to DEBUG. Otherwise a parser regression surfaces only as a
        downstream timeout or an incomplete snapshot."""

        key = (handler.__class__.__name__, type(exc).__name__)
        seen = self._handler_failures_seen
        level = logging.DEBUG if key in seen else logging.WARNING
        seen.add(key)
        self._log.log(
            level,
            "%s %s failed on op 0x%04X %s: %s",
            LogTag.PARSE,
            key[0],
            op,
            direction,
            exc,
            exc_info=exc,
        )
