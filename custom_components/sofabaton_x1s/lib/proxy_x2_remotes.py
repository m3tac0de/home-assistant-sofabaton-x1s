"""X2 paired devices: the rows of the hub's paired-device list (remotes,
repeaters, single-button RF devices), the remote target cached from them,
and the find-remote target built from them. Row layout and target bit field:
:mod:`remote_sync_frames`.

Also the paired remotes and repeaters a device's IR can be routed to
(:mod:`emitter_routing`). Read on demand only, and the last read is kept.
The hub's IR ports are not read: the bytes that look like cable flags
change on their own (bench 2026-10-28), so both ports are always offered."""

from __future__ import annotations

import threading
import time
from typing import TYPE_CHECKING, Any

from .hub_versions import HUB_VERSION_X2
from .protocol_const import (
    FAMILY_REMOTE_STATUS,
    OP_STATUS_ACK,
    OP_X2_REMOTE_LIST,
)
from .remote_sync_frames import X2PairedDevice, parse_x2_paired_row

if TYPE_CHECKING:
    from .proxy_host import _ProxyHost

#: The find-remote target when no paired remote is known: remote 1.
X2_FIND_REMOTE_FALLBACK = b"\x00\x00\x08"

#: Status byte the hub answers the paired-device list with when nothing is
#: paired.
_STATUS_NO_ROWS = 0x07
#: Status byte of an X2 updating a remote or repeater (the busy query's
#: answer while it syncs, bench B1). Whether it refuses a read with it too
#: is not benched; such a read is reported as not read.
_STATUS_UPDATING_REMOTE = 0x11
#: A full paired-device row reaches its name (p[21]); shorter frames of the
#: same family (the X1/X1S remote-info row) are not rows of this list.
_FULL_ROW_LEN = 21


class X2RemotesMixin(_ProxyHost if TYPE_CHECKING else object):
    """Paired-device rows of an X2 (uses the host's ``can_issue_commands``
    and ``enqueue_cmd``)."""

    def _init_x2_remotes(self) -> None:
        self._x2_remote_sync_id_lock = threading.Lock()
        self._x2_remote_sync_id: bytes | None = None
        self._x2_remote_sync_id_event = threading.Event()
        # Paired-device rows by (row type, bit), from the last list reply.
        self._x2_paired_devices: dict[tuple[int, int], X2PairedDevice] = {}
        # The last IR emitter hardware read (read_ir_emitter_status).
        self._ir_emitter_status: dict[str, Any] | None = None

    def update_x2_remote_sync_id(self, remote_id: bytes) -> None:
        with self._x2_remote_sync_id_lock:
            self._x2_remote_sync_id = bytes(remote_id[:3])
            self._x2_remote_sync_id_event.set()

    def wait_for_x2_remote_sync_id(self, timeout: float = 2.0) -> bytes | None:
        self._x2_remote_sync_id_event.wait(timeout)
        with self._x2_remote_sync_id_lock:
            return self._x2_remote_sync_id

    def note_x2_paired_device(self, row: X2PairedDevice) -> None:
        """Record one decoded X2 paired-device row (list reply handler).

        Row 1 starts a new list, so devices unpaired since the last request
        drop out.
        """

        with self._x2_remote_sync_id_lock:
            if row.index <= 1:
                self._x2_paired_devices.clear()
            self._x2_paired_devices[(row.row_type, row.slot)] = row

    def x2_paired_devices(self) -> list[X2PairedDevice]:
        """The X2 paired devices from the last list reply, in row order."""

        with self._x2_remote_sync_id_lock:
            return sorted(self._x2_paired_devices.values(), key=lambda row: row.index)

    def _x2_find_remote_target(self) -> bytes:
        """The X2 find-remote target: every paired remote's bit, from the
        paired-device list (read once, stored rows, if none is cached yet).
        Falls back to remote 1 when no remote row comes back.
        """

        def remotes() -> list[X2PairedDevice]:
            return [row for row in self.x2_paired_devices() if row.is_remote]

        found = remotes()
        if not found and self.can_issue_commands():
            self.enqueue_cmd(OP_X2_REMOTE_LIST, b"\x00")
            deadline = time.monotonic() + 2.0
            while time.monotonic() < deadline:
                rows = self.x2_paired_devices()
                if rows and rows[-1].index >= rows[-1].count:
                    break
                time.sleep(0.05)
            found = remotes()
        target = bytearray(3)
        for row in found:
            for index, bit in enumerate(row.target):
                target[index] |= bit
        return bytes(target) if any(target) else X2_FIND_REMOTE_FALLBACK

    def read_x2_paired_devices(self, *, fresh: bool = True, timeout: float = 10.0) -> list[X2PairedDevice] | None:
        """The X2 paired-device list, read in one exchange, in row order.

        ``fresh`` asks with ``[01]``: the hub polls its paired devices first
        (about 3 s on the bench, B3), so online and battery are current;
        ``[00]`` returns the rows it stored. ``[]`` when nothing is paired;
        None on another model, when the hub cannot be asked, or when its
        answer does not complete. The rows also land in the cached list
        (:meth:`x2_paired_devices`) through the row handler.
        """

        if self.hub_version != HUB_VERSION_X2 or not self.can_issue_commands():
            return None
        rows: list[X2PairedDevice] = []
        status_family = OP_STATUS_ACK & 0xFF
        with self.exchange("x2_paired_list"):
            self.clear_ack_queue()
            send_ts = time.monotonic()
            self._send_family_frame(OP_X2_REMOTE_LIST & 0xFF, b"\x01" if fresh else b"\x00")
            deadline = send_ts + timeout
            while True:
                remaining = deadline - time.monotonic()
                matched = (
                    self.wait_for_ack_families_low(
                        (FAMILY_REMOTE_STATUS, status_family), timeout=remaining, not_before=send_ts
                    )
                    if remaining > 0
                    else None
                )
                if matched is None:
                    self._log.info("[REMOTE_SYNC] the paired-device list did not complete (%d rows)", len(rows))
                    return None
                opcode, payload = matched
                if opcode & 0xFF == status_family:
                    status = payload[0] if payload else None
                    if status == _STATUS_NO_ROWS and not rows:
                        return []
                    if status == _STATUS_UPDATING_REMOTE:
                        self._log.info("[REMOTE_SYNC] paired-device list not read: the hub is updating a remote")
                        return None
                    continue
                row = parse_x2_paired_row(payload) if len(payload) >= _FULL_ROW_LEN else None
                if row is None:
                    continue
                rows.append(row)
                if row.index >= row.count:
                    return rows

    def read_ir_emitter_status(self) -> dict[str, Any] | None:
        """Read the paired devices the X2 can route IR to and keep it.

        The fresh paired-device list. Returns ``{"paired":
        [X2PairedDevice, ...] or None, "read_at": epoch seconds}``,
        ``paired`` None when the hub did not answer; None on another model
        or when the hub cannot be asked (nothing is stored then).
        """

        if self.hub_version != HUB_VERSION_X2 or not self.can_issue_commands():
            return None
        paired = self.read_x2_paired_devices(fresh=True)
        status: dict[str, Any] = {"paired": paired, "read_at": time.time()}
        with self._x2_remote_sync_id_lock:
            self._ir_emitter_status = status
        return dict(status)

    def last_ir_emitter_status(self) -> dict[str, Any] | None:
        """The last :meth:`read_ir_emitter_status` result, without asking
        the hub; None before the first read."""

        with self._x2_remote_sync_id_lock:
            return dict(self._ir_emitter_status) if self._ir_emitter_status is not None else None


__all__ = ["X2_FIND_REMOTE_FALLBACK", "X2RemotesMixin"]
