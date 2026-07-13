"""IR playback + single-command persist mixin for :class:`X1Proxy`.

Carries everything tied to family-0x0F replay frames and the
single-command save path (family-0x0E paged writes):

* :meth:`play_ir_blob` and the lower-level :meth:`_play_ir_blob_body`
  loop that drives the per-frame ack pacing for a one-shot playback.
* The persist write-pipeline -- :meth:`persist_ir_blob`,
  :meth:`persist_command_record`, and the
  ``_build_command_write_steps_for_persist`` / ``_allocate_command_id``
  / ``_run_persist_write`` helpers that translate "save this one
  command on this device" into a paged family-0x0E burst.
* Shape sniffers and tail-checksum diagnostics for replay payloads.
* :meth:`_get_active_ir_dump_pending`, used by the IR-dump ingest path
  to look up the in-flight burst keyed off the current burst kind.
"""

from __future__ import annotations

import time
from typing import Any

from .commands import descriptive_play_blob_text, looks_like_descriptive_play_blob
from .device_create import (
    build_command_write_steps,
    build_key_sort_steps,
    encode_command_sort_body,
)
from .protocol_const import (
    FAMILY_PLAY_BLOB,
    PLAY_BLOB_BODY_HEADER_LEN,
    PLAY_BLOB_CHUNK_SIZE,
    PLAY_BLOB_MAX_PAYLOAD,
    PLAY_BLOB_PAGE_HEADER_LEN,
)


def _run_create_sequence(*args, **kwargs):
    from . import x1_proxy as _xp

    return _xp.run_create_sequence(*args, **kwargs)


class IrBlobMixin:
    """Mixin providing IR playback and single-command persist writes."""

    def play_ir_blob(
        self,
        blob: bytes,
        *,
        inter_frame_delay: float = 0.08,
        ack_timeout: float = 1.0,
        final_ack_timeout: float = 0.25,
    ) -> bool:
        """Send a canonical IR blob body to the hub for one-shot playback.

        ``blob`` is the raw library_data the hub stores for this command —
        the same bytes returned by ``fetch_blob`` and produced by the
        descriptive-descriptor builder. The wire body buffer (header +
        library_data + sum8) is constructed here and then chunked across
        family-0x0F frames.

        Returns True on success; False if the proxy is not in a state to
        issue commands or the blob is too short to be valid.
        """

        if not self.can_issue_commands():
            self._log.info("[PLAY_BLOB] ignored: proxy client is connected")
            return False

        if not isinstance(blob, (bytes, bytearray)) or len(blob) < 10:
            self._log.warning("[PLAY_BLOB] blob too short or wrong type: %r", type(blob))
            return False

        body_buffer = self._build_play_blob_body_buffer(bytes(blob))
        ok, rejected = self._play_ir_blob_body(
            body_buffer,
            inter_frame_delay=inter_frame_delay,
            ack_timeout=ack_timeout,
            final_ack_timeout=final_ack_timeout,
        )
        if ok:
            return True
        return False

    @staticmethod
    def _next_available_command_id(existing_command_ids: list[int]) -> int:
        used = {int(command_id) & 0xFF for command_id in existing_command_ids if 1 <= int(command_id) <= 255}
        for candidate in range(1, 256):
            if candidate not in used:
                return candidate
        raise ValueError("device already uses all 255 command ids")

    @staticmethod
    def _validated_command_label(command_name: str) -> str:
        """Return the command label after the persist write-path's basic
        validation. The actual encoding into a fixed-width slot is the
        builder's responsibility.
        """

        text = str(command_name or "").strip()
        if not text:
            raise ValueError("command_name is required")
        return text

    def _build_command_write_steps_for_persist(
        self,
        *,
        device_id: int,
        command_id: int,
        command_name: str,
        library_type: int,
        library_data: bytes,
        button_code: int = 0,
        ack_timeout: float = 5.0,
    ) -> list[Any]:
        """Build paged command-write steps for the single-command persist path.

        A persist write is just a burst of size 1 -- the same wire shape
        the device-create burst uses for each of its N commands, with
        ``command_seq=1`` and ``command_burst_size=1``.
        """

        if command_id < 1 or command_id > 0xFF:
            raise ValueError(f"command_id {command_id} out of byte range")

        return build_command_write_steps(
            hub_version=self.hub_version,
            command_seq=1,
            command_burst_size=1,
            device_id=device_id & 0xFF,
            button_id=command_id & 0xFF,
            library_type=library_type & 0xFF,
            button_code=button_code & 0xFFFFFFFFFFFF,
            label=self._validated_command_label(command_name),
            library_data=bytes(library_data),
            ack_timeout=ack_timeout,
        )

    def _allocate_command_id(
        self,
        device_commands: dict[int, str] | None,
        command_id: int | None,
    ) -> int:
        """Pick the slot id this persist write should land on.

        Either accept the caller's explicit ``command_id`` (validated
        against the existing slots on the device) or auto-allocate the
        next free id.
        """

        existing_command_ids = (
            sorted(int(existing_id) & 0xFF for existing_id in device_commands.keys())
            if isinstance(device_commands, dict)
            else []
        )
        if command_id is None:
            return self._next_available_command_id(existing_command_ids)
        new_command_id = int(command_id) & 0xFF
        if new_command_id < 1 or new_command_id > 0xFF:
            raise ValueError(f"command_id {new_command_id} out of byte range")
        if new_command_id in existing_command_ids:
            raise ValueError(
                f"command_id {new_command_id} already exists on the target device"
            )
        return new_command_id

    def _run_persist_write(
        self,
        *,
        log_prefix: str,
        device_id: int,
        command_id: int,
        command_name: str,
        library_type: int,
        library_data: bytes,
        button_code: int,
        ack_timeout: float,
    ) -> dict[str, Any] | None:
        """Shared driver for single-command persist writes.

        Builds the family-0x0E steps via :func:`build_command_write_steps`,
        clears the ack queue, then feeds the step list through
        :func:`run_create_sequence`. Surfaces hub rejection
        (``STATUS_ACK 0x0C``) as a warning distinct from timeout.
        """

        steps = self._build_command_write_steps_for_persist(
            device_id=device_id,
            command_id=command_id,
            command_name=command_name,
            library_type=library_type,
            library_data=library_data,
            button_code=button_code,
            ack_timeout=ack_timeout,
        )
        self._log.info(
            "[%s] uploading dev=0x%02X new_command_id=0x%02X lib=0x%02X pages=%d data=%dB",
            log_prefix,
            device_id & 0xFF,
            command_id & 0xFF,
            library_type & 0xFF,
            len(steps),
            len(library_data) + 1,
        )

        self.clear_ack_queue()
        result = _run_create_sequence(self, steps)
        if not result.success:
            if result.rejected:
                self._log.warning(
                    "[%s] hub rejected page %d/%d dev=0x%02X lib=0x%02X",
                    log_prefix,
                    (result.failed_index or 0) + 1,
                    len(steps),
                    device_id & 0xFF,
                    library_type & 0xFF,
                )
            else:
                self._log.warning(
                    "[%s] timeout waiting for page ack %d/%d dev=0x%02X",
                    log_prefix,
                    (result.failed_index or 0) + 1,
                    len(steps),
                    device_id & 0xFF,
                )
            return None
        return {"page_count": len(steps)}

    def persist_ir_blob(
        self,
        *,
        device_id: int,
        command_name: str,
        blob: bytes,
        command_id: int | None = None,
        inter_frame_delay: float = 0.08,  # retained for API compat; unused
        ack_timeout: float = 5.0,
    ) -> dict[str, Any] | None:
        """Persist a new IR command blob onto an existing device.

        Uploads family ``0x0E`` save pages (the same wire format used
        by all single-command saves regardless of codec). The codec
        selector is fixed at ``library_type=0x0D`` (IR-DB), and no
        canonical button-code is asserted -- the hub assigns one on
        accept. Use :meth:`persist_command_record` for non-IR codecs.
        """

        del inter_frame_delay  # paging cadence now lives in the sequencer

        if not self.can_issue_commands():
            self._log.info("[PERSIST_IR_BLOB] ignored: proxy client is connected")
            return None

        if not isinstance(blob, (bytes, bytearray)) or len(blob) < 10:
            self._log.warning("[PERSIST_IR_BLOB] blob too short or wrong type: %r", type(blob))
            return None

        dev_lo = device_id & 0xFF
        device_commands = self.state.commands.get(dev_lo, {})
        new_command_id = self._allocate_command_id(device_commands, command_id)

        outcome = self._run_persist_write(
            log_prefix="PERSIST_IR_BLOB",
            device_id=dev_lo,
            command_id=new_command_id,
            command_name=command_name,
            library_type=0x0D,
            library_data=bytes(blob),
            button_code=0,
            ack_timeout=ack_timeout,
        )
        if outcome is None:
            return None

        if not isinstance(device_commands, dict):
            device_commands = {}
            self.state.commands[dev_lo] = device_commands
        device_commands[new_command_id] = (
            str(command_name or "").strip() or f"Command {new_command_id}"
        )
        self._commands_complete.add(dev_lo)

        # The save above leaves the new command with sort_id=0, which
        # keeps it off the physical remote's device-browse screen even
        # though it plays back fine when bound to a button or invoked
        # by name. Push an updated per-device sort table so the new
        # entry takes the next free display slot. Failure here is not
        # fatal -- the command itself is already saved.
        self._register_command_in_device_sort(
            dev_lo=dev_lo,
            new_command_id=new_command_id,
            ack_timeout=ack_timeout,
        )

        return {
            "status": "success",
            "device_id": dev_lo,
            "command_id": new_command_id,
            "command_name": device_commands[new_command_id],
            "page_count": outcome["page_count"],
        }

    def _register_command_in_device_sort(
        self,
        *,
        dev_lo: int,
        new_command_id: int,
        ack_timeout: float,
    ) -> None:
        """Append the freshly-saved command to the device's display order.

        Re-emits the full family-0x61 ``(command_id, sort_position)``
        table for ``dev_lo`` with the new command tacked onto the end
        at the next free position. Existing commands keep whatever
        positions the hub had already assigned them; commands the hub
        has on record but that have never been assigned a position
        (sort_id==0) are folded in after the previously-positioned
        ones so the table stays a complete enumeration.
        """

        metadata = self.state.command_metadata.get(dev_lo) or {}
        known_command_ids = set(metadata.keys())
        device_commands = self.state.commands.get(dev_lo) or {}
        known_command_ids.update(device_commands.keys())
        known_command_ids.add(new_command_id)

        positioned: list[tuple[int, int]] = []
        unpositioned: list[int] = []
        for command_id in known_command_ids:
            if command_id == new_command_id:
                continue
            entry = metadata.get(command_id) or {}
            sort_id = int(entry.get("sort_id", 0)) & 0xFF
            if sort_id:
                positioned.append((command_id & 0xFF, sort_id))
            else:
                unpositioned.append(command_id & 0xFF)

        positioned.sort(key=lambda pair: pair[1])
        next_position = (positioned[-1][1] if positioned else 0) + 1
        ordered_pairs: list[tuple[int, int]] = list(positioned)
        for command_id in sorted(unpositioned):
            ordered_pairs.append((command_id, next_position))
            next_position += 1
        ordered_pairs.append((new_command_id & 0xFF, next_position))

        try:
            body = encode_command_sort_body(ordered_pairs)
            steps = build_key_sort_steps(
                device_id=dev_lo,
                msg_hex=body.hex(),
                ack_timeout=ack_timeout,
            )
        except ValueError as exc:
            self._log.warning(
                "[PERSIST_IR_BLOB] could not build sort write dev=0x%02X: %s",
                dev_lo,
                exc,
            )
            return

        self.clear_ack_queue()
        result = _run_create_sequence(self, steps)
        if not result.success:
            self._log.warning(
                "[PERSIST_IR_BLOB] sort write %s dev=0x%02X page=%d/%d "
                "(command still saved, may not appear in the remote's "
                "device-browse list until the next reorder)",
                "rejected" if result.rejected else "timed out",
                dev_lo,
                (result.failed_index or 0) + 1,
                len(steps),
            )
            return

        # Mirror the position we just told the hub about so a follow-up
        # save against the same device doesn't reuse the same slot.
        bucket = self.state.command_metadata.setdefault(dev_lo, {})
        bucket[new_command_id & 0xFF] = {
            **(bucket.get(new_command_id & 0xFF) or {}),
            "sort_id": ordered_pairs[-1][1] & 0xFF,
        }

    def persist_command_record(
        self,
        *,
        device_id: int,
        command_name: str,
        library_type: int,
        command_data: bytes,
        command_code: int = 0,
        command_id: int | None = None,
        inter_frame_delay: float = 0.08,  # retained for API compat; unused
        ack_timeout: float = 5.0,
    ) -> dict[str, Any] | None:
        """Persist an opaque hub-owned command record onto an existing device.

        ``library_type`` selects the codec (``0x03`` Bluetooth, RF
        variants, learned-IR, etc.). ``command_code`` is the 48-bit
        canonical identifier the hub stores alongside the codec bytes
        and that downstream button-binding / macro writes reference.
        """

        del inter_frame_delay

        if not self.can_issue_commands():
            self._log.info("[PERSIST_CMD] ignored: proxy client is connected")
            return None

        if not isinstance(command_data, (bytes, bytearray)) or len(command_data) < 1:
            raise ValueError("command_data is too short to persist")
        if library_type < 0 or library_type > 0xFF:
            raise ValueError(f"library_type {library_type} out of byte range")
        if command_code < 0 or command_code > 0xFFFFFFFFFFFF:
            raise ValueError(f"command_code {command_code} out of 48-bit range")

        dev_lo = device_id & 0xFF
        device_commands = self.state.commands.get(dev_lo, {})
        new_command_id = self._allocate_command_id(device_commands, command_id)

        outcome = self._run_persist_write(
            log_prefix="PERSIST_CMD",
            device_id=dev_lo,
            command_id=new_command_id,
            command_name=command_name,
            library_type=library_type,
            library_data=bytes(command_data),
            button_code=command_code,
            ack_timeout=ack_timeout,
        )
        if outcome is None:
            return None

        if not isinstance(device_commands, dict):
            device_commands = {}
            self.state.commands[dev_lo] = device_commands
        device_commands[new_command_id] = (
            str(command_name or "").strip() or f"Command {new_command_id}"
        )
        self._commands_complete.add(dev_lo)
        return {
            "status": "success",
            "device_id": dev_lo,
            "command_id": new_command_id,
            "command_name": device_commands[new_command_id],
            "page_count": outcome["page_count"],
            "library_type": library_type & 0xFF,
        }

    def overwrite_command_payload(
        self,
        *,
        device_id: int,
        command_id: int,
        command_name: str,
        library_type: int,
        library_data: bytes,
        button_code: int,
        ack_timeout: float = 5.0,
    ) -> dict[str, Any] | None:
        """Overwrite an **existing** command's payload in place (family ``0x0E``).

        Unlike :meth:`persist_ir_blob` / :meth:`persist_command_record`, this
        targets a ``command_id`` that already exists on the device: the write
        lands on the same slot with the same ``button_code`` / ``library_type``
        / label / default key-slot, changing only ``library_data``. The hub
        treats a ``0x0E`` record write to an already-occupied
        ``(device_id, command_id)`` as an in-place overwrite -- so this
        deliberately skips :meth:`_allocate_command_id` (which refuses an
        existing id) and the sort-registration step (the slot already has a
        display position).

        The caller must supply the preserved ``button_code`` / ``library_type``
        / ``command_name``; the live-sync executor reads them back from
        ``state.command_metadata`` / the command label map so any bindings or
        macros that reference the command's 48-bit code keep resolving.
        """

        if not self.can_issue_commands():
            self._log.info("[OVERWRITE_CMD] ignored: proxy client is connected")
            return None

        if not isinstance(library_data, (bytes, bytearray)) or len(library_data) < 1:
            self._log.warning(
                "[OVERWRITE_CMD] library_data too short or wrong type: %r", type(library_data)
            )
            return None
        if library_type < 0 or library_type > 0xFF:
            raise ValueError(f"library_type {library_type} out of byte range")
        if button_code < 0 or button_code > 0xFFFFFFFFFFFF:
            raise ValueError(f"button_code {button_code} out of 48-bit range")

        dev_lo = device_id & 0xFF
        cmd_lo = command_id & 0xFF
        device_commands = self.state.commands.get(dev_lo, {})
        if not isinstance(device_commands, dict) or cmd_lo not in device_commands:
            self._log.warning(
                "[OVERWRITE_CMD] command 0x%02X not present on dev=0x%02X -- refusing "
                "to write a new slot from the overwrite path",
                cmd_lo,
                dev_lo,
            )
            return None

        outcome = self._run_persist_write(
            log_prefix="OVERWRITE_CMD",
            device_id=dev_lo,
            command_id=cmd_lo,
            command_name=command_name,
            library_type=library_type,
            library_data=bytes(library_data),
            button_code=button_code,
            ack_timeout=ack_timeout,
        )
        if outcome is None:
            return None

        # Keep the cached label coherent with the write (the payload edit does
        # not change the name, but the write carries the label slot, so mirror
        # whatever we just sent).
        device_commands[cmd_lo] = (
            str(command_name or "").strip() or device_commands.get(cmd_lo) or f"Command {cmd_lo}"
        )
        return {
            "status": "success",
            "device_id": dev_lo,
            "command_id": cmd_lo,
            "command_name": device_commands[cmd_lo],
            "page_count": outcome["page_count"],
            "library_type": library_type & 0xFF,
        }

    def _play_ir_blob_body(
        self,
        body_buffer: bytes,
        *,
        inter_frame_delay: float,
        ack_timeout: float,
        final_ack_timeout: float,
    ) -> tuple[bool, bool]:
        """Chunk a fully-built playback body buffer across family-0x0F frames.

        ``body_buffer`` is the complete sealed body: 12-byte header,
        library_data, and trailing sum8. Each wire frame carries a
        ``PLAY_BLOB_CHUNK_SIZE``-byte (247B) slice of this buffer prefixed
        with a 3-byte page header ``[0x01, 0x00, page_no_lo]``.

        Returns ``(ok, rejected)`` where ``rejected`` is true only when the
        hub explicitly NACKs playback with ``0x0103/0x0C``.
        """

        body_len = len(body_buffer)
        total_frames = self._play_blob_total_frames(body_len)

        self._log.info(
            "[PLAY_BLOB] sending %dB body in %d frame(s)", body_len, total_frames,
        )

        # Ignore any stale ACKs already queued from prior traffic; playback must
        # pace itself only on ACKs caused by the chunks we are about to send.
        self.clear_ack_queue()

        send_ts = time.monotonic()
        for seq in range(1, total_frames + 1):
            if seq > 1 and inter_frame_delay > 0:
                time.sleep(inter_frame_delay)
            slice_start = (seq - 1) * PLAY_BLOB_CHUNK_SIZE
            slice_end = min(slice_start + PLAY_BLOB_CHUNK_SIZE, body_len)
            body_slice = body_buffer[slice_start:slice_end]
            frame_payload = bytes([0x01, 0x00, seq & 0xFF]) + body_slice
            send_ts = time.monotonic()
            self._send_family_play_frame(frame_payload)
            candidates = [(0x0103, 0x00)]
            if seq == total_frames:
                candidates.append((0x0103, 0x0C))
            chunk_ack = self.wait_for_ack_any(candidates, timeout=ack_timeout, not_before=send_ts)
            if chunk_ack is None:
                self._log.warning(
                    "[PLAY_BLOB] timeout waiting for chunk ack seq=%d/%d",
                    seq,
                    total_frames,
                )
                return False, False
            if chunk_ack[1][:1] == b"\x0c":
                self._log.warning(
                    "[PLAY_BLOB] chunk rejected seq=%d/%d %s",
                    seq,
                    total_frames,
                    self._play_blob_tail_diagnostics(body_buffer),
                )
                return False, True

        # A late 0x0103/0x0C after a successful final 0x00 indicates the hub
        # rejected playback after processing the last chunk.
        completion_ack = self._wait_for_ack_any_impl(
            [(0x0103, 0x0C)],
            timeout=final_ack_timeout,
            not_before=send_ts,
            log_timeout=False,
        )
        if completion_ack is not None:
            self._log.warning(
                "[PLAY_BLOB] hub reported playback failure after final chunk %s",
                self._play_blob_tail_diagnostics(body_buffer),
            )
            return False, True

        return True, False

    def _send_family_play_frame(self, payload: bytes) -> None:
        """Send one family-0x0F playback frame, encoding payload length into the opcode high byte."""
        opcode = ((len(payload) & 0xFF) << 8) | (FAMILY_PLAY_BLOB & 0xFF)
        self._send_cmd_frame(opcode, payload)

    @staticmethod
    def _looks_like_descriptive_play_blob(blob: bytes) -> bool:
        """Return True for human-readable protocol-descriptor replay blobs."""
        return looks_like_descriptive_play_blob(blob)

    @staticmethod
    def _looks_like_x1_database_capture_blob(blob: bytes) -> bool:
        """Return True for observed non-descriptor X1/X1S database-style blobs."""
        return (
            len(blob) >= 14
            and blob[2:6] == b"\x00\x00\x00\x00"
            and blob[6:8] in (b"\x9c\x40", b"\x94\xcf", b"\x94\x74")
        )

    @staticmethod
    def _extract_single_frame_play_blob(payload: bytes) -> bytes | None:
        """Extract a complete single-frame replay library_data from a family-0x0F payload.

        Single-frame replay requests use the layout:
        ``[01 00 01] [01 00 <total_pages_be> 00 00 00 00 00 00 00 00 00]`` +
        library_data + sum8. ``total_pages_be`` must be 1 for a single-frame
        replay. Returns the embedded library_data (without the trailing sum8),
        or None if the payload doesn't match.
        """
        preface_len = PLAY_BLOB_PAGE_HEADER_LEN + PLAY_BLOB_BODY_HEADER_LEN  # 15
        if len(payload) < preface_len + 1:
            return None
        if payload[0:3] != b"\x01\x00\x01":
            return None
        if payload[3:5] != b"\x01\x00":
            return None
        if payload[5] != 0x01:
            return None
        if payload[6:preface_len] != b"\x00" * (preface_len - 6):
            return None
        # Drop the trailing body sum8 byte to surface only library_data.
        return payload[preface_len:-1] or None

    @staticmethod
    def _descriptive_play_blob_text(blob: bytes) -> str | None:
        """Return the human-readable descriptor string from a descriptive blob."""
        return descriptive_play_blob_text(blob)

    def _build_play_blob_body_buffer(self, library_data: bytes) -> bytes:
        """Return the fully sealed body buffer for a playback of ``library_data``.

        Layout::

            body[0]     = 0x01
            body[1..2]  = total_pages BE
            body[3..5]  = 0x00 0x00 0x00
            body[6..11] = 0x00 * 6
            body[12..]  = library_data
            body[-1]    = sum8(body[:-1])
        """

        body_len = PLAY_BLOB_BODY_HEADER_LEN + len(library_data) + 1
        total_pages = (body_len + PLAY_BLOB_CHUNK_SIZE - 1) // PLAY_BLOB_CHUNK_SIZE
        body = bytearray(body_len)
        body[0] = 0x01
        body[1] = (total_pages >> 8) & 0xFF
        body[2] = total_pages & 0xFF
        body[PLAY_BLOB_BODY_HEADER_LEN:PLAY_BLOB_BODY_HEADER_LEN + len(library_data)] = library_data
        body[-1] = sum(body[:-1]) & 0xFF
        return bytes(body)

    def _finalize_play_blob_body(self, library_data: bytes) -> bytes:
        """Return ``library_data`` with the trailing body sum8 byte appended.

        Equivalent to slicing off the 12-byte body header from the sealed
        body buffer built by :meth:`_build_play_blob_body_buffer`.
        """

        body_buffer = self._build_play_blob_body_buffer(bytes(library_data))
        return body_buffer[PLAY_BLOB_BODY_HEADER_LEN:]

    def _play_blob_total_frames(self, body_len: int) -> int:
        """Return the number of family-0x0F frames needed for a body buffer."""

        if body_len <= 0:
            return 0
        return (body_len + PLAY_BLOB_CHUNK_SIZE - 1) // PLAY_BLOB_CHUNK_SIZE

    def _play_blob_tail_diagnostics(self, blob: bytes) -> str:
        """Return compact checksum candidates for blob-tail replay failures."""
        if not blob:
            return "len=0"

        body = blob[:-1]
        sum8 = sum(body) & 0xFF
        xor8 = 0
        for value in body:
            xor8 ^= value

        def _crc8_maxim(data: bytes) -> int:
            crc = 0x00
            for byte in data:
                crc ^= byte
                for _ in range(8):
                    if crc & 0x01:
                        crc = ((crc >> 1) ^ 0x8C) & 0xFF
                    else:
                        crc = (crc >> 1) & 0xFF
            return crc & 0xFF

        last_words = " ".join(f"{value:02x}" for value in blob[-8:])
        return (
            f"len={len(blob)} last=0x{blob[-1]:02X} "
            f"sum=0x{sum8:02X} plus1=0x{((sum8 + 1) & 0xFF):02X} "
            f"plus2=0x{((sum8 + 2) & 0xFF):02X} negsum=0x{((0x100 - sum8) & 0xFF):02X} "
            f"xor=0x{xor8:02X} crc8_maxim=0x{_crc8_maxim(body):02X} "
            f"tail8=[{last_words}]"
        )

    def _get_active_ir_dump_pending(
        self,
        *,
        device_id: int | None = None,
        burst_kind: str | None = None,
    ) -> tuple[tuple[int, int], dict[str, Any]] | tuple[None, None]:
        if burst_kind and burst_kind.startswith("ir_dump:"):
            parts = burst_kind.split(":")
            if len(parts) >= 3:
                try:
                    key = (int(parts[1]) & 0xFF, int(parts[2]) & 0xFF)
                except ValueError:
                    key = None
                if key is not None:
                    pending = self._ir_dump_pending.get(key)
                    if pending is not None:
                        return key, pending

        if device_id is None:
            return None, None

        dev_lo = device_id & 0xFF
        for key, pending in self._ir_dump_pending.items():
            if key[0] == dev_lo and not pending["event"].is_set():
                return key, pending

        return None, None


__all__ = ["IrBlobMixin"]
