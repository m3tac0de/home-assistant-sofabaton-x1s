"""Remote-sync frames beyond the full trigger, and the X2 paired-device rows.

The full trigger (``0x0064`` on the X1/X1S, the ``0x0364 [FF FF FF]``
broadcast on the X2) is bench-validated and lives in :mod:`write_batch`.
The per-remote, order-only and per-entity forms here were validated on the
hubs with ``scripts/hub-bench/bench_333_per_item_sync.py`` (2026-10-24) but
are not wired into a write flow by default (see
``WriteBatchMixin.entity_sync_form`` and ``order_sync_form``).

X2 paired-device rows (reply family 0x2F to ``0x012E``), payload offsets with
the checksum stripped:

    p[0] row number (1-based), p[1] row count (the last row has p[0] == p[1]),
    p[2] / p[3] / p[4] the device's bit in its class byte (which one is set
    depends on p[12]), p[5] battery %, p[6] hardware code,
    p[7:11] production batch, p[11] firmware code, p[12] row type,
    p[13] online flag, p[14:21] type-specific (a remote: p[14] RF band,
    p[15:21] its MAC; a repeater: p[14] a cable in its IR port, not benched
    yet), p[21:] name (null-padded)

Row types: 0 a remote, 1 a repeater, 2 a single-button RF device.

The 3-byte X2 target is a bit field: byte 2 holds the remotes (remote 1 is
``0x08``, bench_333 C0/C1; the low bits of that byte are the hub's own),
byte 1 the repeaters, byte 0 the single-button RF devices. A row's bit byte
goes into the target byte of its type, so the frame addresses that device
alone; bits OR together, and ``FF FF FF`` addresses everything.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from .emitter_routing import remote_number, repeater_number
from .hub_versions import HUB_VERSION_X2
from .protocol_const import OP_ACTIVITY_ASSIGN_COMMIT, OP_X2_REMOTE_SYNC

#: Activity ids start here; devices sit below.
ACTIVITY_ID_BASE = 0x65

#: Row types of the X2 paired-device list.
X2_ROW_TYPE_REMOTE = 0
X2_ROW_TYPE_REPEATER = 1

#: Payload byte that holds the device's bit, and the target byte that carries
#: it, per row type (2: single-button RF, 1: repeater). Types not listed use
#: the remote position. ``slot`` below is that bit byte, not an index.
_SLOT_OFFSET_BY_TYPE = {2: 2, 1: 3}
_TARGET_INDEX_BY_TYPE = {2: 0, 1: 1}
_REMOTE_SLOT_OFFSET = 4
_REMOTE_TARGET_INDEX = 2

#: Smallest row that carries the row type (p[12]).
_MIN_ROW_LEN = 13

#: Every paired device.
X2_TARGET_ALL = b"\xff\xff\xff"
#: The remote byte, all bits: every remote (and the hub's own low bits). The
#: order-only sync is validated with exactly this target (bench_333 C3).
X2_TARGET_ALL_REMOTES = b"\x00\x00\xff"

#: Mode byte of the 4-byte X2 sync payload (bench_333 C1/C3): a full
#: rebuild, or the device/activity order only.
X2_SYNC_FLAG_FULL = 0x01
X2_SYNC_FLAG_ORDER = 0x00

#: Family of the per-entity sync frame (``0x0165 [id]`` on the X1/X1S,
#: ``0x0265 [id][0x01]`` on the X2).
FAMILY_ENTITY_SYNC = 0x65
OP_ENTITY_SYNC = 0x0100 | FAMILY_ENTITY_SYNC
OP_X2_ENTITY_SYNC = OP_ACTIVITY_ASSIGN_COMMIT
X2_ENTITY_SYNC_FLAG = 0x01


@dataclass(frozen=True)
class X2PairedDevice:
    """One row of the X2 paired-device list (``index`` is 1-based)."""

    index: int
    count: int
    row_type: int
    slot: int
    battery: int
    hardware: int
    batch: str
    firmware: int
    online: bool
    mac: str
    name: str
    raw: bytes
    #: A repeater's IR port has a cable in it; None for other row types.
    port_cable: bool | None = None

    @property
    def target(self) -> bytes:
        """The 3-byte field that addresses this device alone."""

        return x2_target(self.row_type, self.slot)

    @property
    def is_remote(self) -> bool:
        return self.row_type == X2_ROW_TYPE_REMOTE

    @property
    def is_repeater(self) -> bool:
        return self.row_type == X2_ROW_TYPE_REPEATER

    @property
    def number(self) -> int | None:
        """Remote 1-5 or repeater 1-4, from the row's bit; None for other
        row types or a bit outside them."""

        if self.is_remote:
            return remote_number(self.slot)
        if self.is_repeater:
            return repeater_number(self.slot)
        return None


def parse_x2_paired_row(payload: bytes) -> X2PairedDevice | None:
    """Decode one family-0x2F row; None when it is too short to carry a type."""

    p = bytes(payload)
    if len(p) < _MIN_ROW_LEN:
        return None
    row_type = p[12]
    slot = p[_SLOT_OFFSET_BY_TYPE.get(row_type, _REMOTE_SLOT_OFFSET)]

    def at(offset: int) -> int:
        return p[offset] if len(p) > offset else 0

    name = p[21:].split(b"\x00", 1)[0].decode("utf-8", errors="replace") if len(p) > 21 else ""
    return X2PairedDevice(
        index=p[0],
        count=p[1],
        row_type=row_type,
        slot=slot,
        battery=p[5],
        hardware=p[6],
        batch=p[7:11].hex(),
        firmware=p[11],
        online=at(13) == 1,
        mac=p[15:21].hex() if len(p) >= 21 else "",
        name=name,
        raw=p,
        port_cable=(at(14) == 1) if row_type == X2_ROW_TYPE_REPEATER and len(p) > 14 else None,
    )


def x2_target(row_type: int, slot: int) -> bytes:
    """The 3-byte target that addresses one paired device."""

    target = bytearray(3)
    target[_TARGET_INDEX_BY_TYPE.get(int(row_type), _REMOTE_TARGET_INDEX)] = int(slot) & 0xFF
    return bytes(target)


def x2_remote_sync_frame(target: bytes, flag: int = X2_SYNC_FLAG_FULL) -> tuple[int, bytes]:
    """``(opcode, payload)`` of the 4-byte X2 sync request."""

    target = bytes(target)
    if len(target) != 3:
        raise ValueError(f"an X2 sync target is 3 bytes, got {len(target)}")
    return OP_X2_REMOTE_SYNC, target + bytes([flag & 0xFF])


def x2_order_sync_frame() -> tuple[int, bytes]:
    """The X2 order-only sync of every remote (bench_333 C3; ~10 s for 17 entities)."""

    return x2_remote_sync_frame(X2_TARGET_ALL_REMOTES, X2_SYNC_FLAG_ORDER)


def entity_sync_frame(entity_id: int, *, x2_form: bool) -> tuple[int, bytes]:
    """``(opcode, payload)`` of the per-entity sync for one device or activity.

    ``x2_form`` picks ``0x0265 [id][0x01]`` (X2, bench_333
    C4) over ``0x0165 [id]`` (what every model has been sent so far).
    """

    entity = int(entity_id) & 0xFF
    if x2_form:
        return OP_X2_ENTITY_SYNC, bytes([entity, X2_ENTITY_SYNC_FLAG])
    return OP_ENTITY_SYNC, bytes([entity])


def order_sync_frame(hub_version: str | None) -> tuple[int, bytes] | None:
    """The order-only sync for this hub, or None where it has none (the
    X1S reorder ends with the full ``0x0064``; the X1 needs no sync)."""

    if hub_version == HUB_VERSION_X2:
        return x2_order_sync_frame()
    return None


#: Write-plan steps the remotes pick up without any sync, or that change
#: nothing a remote shows: device and activity renames (the head commit
#: included) reach every model's remote on their own (bench_333 section 14
#: and the 2026-08 bench); idle behaviour and a Wifi Device's callback
#: address are hub-side; ``remote_sync`` is the plan's own read-back.
REMOTE_NEUTRAL_STEP_KINDS = frozenset(
    {"activity_rename", "device_rename", "wifi_head_commit", "idle_behavior", "device_ip", "remote_sync"}
)


def entities_touched_by(steps: Iterable[Any], default_entity: int) -> tuple[int, ...]:
    """The entities whose remote copy a write plan changed, in step order:
    each activity a step names (``activity_id`` from 101 up), otherwise
    ``default_entity`` (the device the plan edits, or a device-page step's
    own device). Remote-neutral steps count for nothing, except a rename
    that also carries an icon or color: that rides the same record write,
    but no bench has shown it reaching the remotes on its own yet."""

    touched: list[int] = []
    for step in steps:
        payload = getattr(step, "payload", None) or {}
        appearance = isinstance(payload, dict) and ("icon" in payload or "color_id" in payload)
        if getattr(step, "kind", None) in REMOTE_NEUTRAL_STEP_KINDS and not appearance:
            continue
        activity = payload.get("activity_id") if isinstance(payload, dict) else None
        if activity is not None and int(activity) & 0xFF >= ACTIVITY_ID_BASE:
            touched.append(int(activity) & 0xFF)
        else:
            touched.append(int(default_entity) & 0xFF)
    return tuple(dict.fromkeys(touched))


__all__ = [
    "FAMILY_ENTITY_SYNC",
    "OP_ENTITY_SYNC",
    "OP_X2_ENTITY_SYNC",
    "REMOTE_NEUTRAL_STEP_KINDS",
    "X2PairedDevice",
    "X2_ENTITY_SYNC_FLAG",
    "X2_ROW_TYPE_REMOTE",
    "X2_SYNC_FLAG_FULL",
    "X2_SYNC_FLAG_ORDER",
    "X2_TARGET_ALL",
    "X2_TARGET_ALL_REMOTES",
    "entities_touched_by",
    "entity_sync_frame",
    "order_sync_frame",
    "parse_x2_paired_row",
    "x2_order_sync_frame",
    "x2_remote_sync_frame",
    "x2_target",
]
